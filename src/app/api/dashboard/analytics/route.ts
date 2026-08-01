// =============================================================================
// Merchant Analytics API Route
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  analyticsWindowDays,
  parseAnalyticsRange,
  resolveAnalyticsWindow,
  toIsoDate,
  type AnalyticsWindow,
} from "@/lib/analytics-range";
import { logger } from "@/lib/logger";

interface SeriesRow {
  bucket: number;
  count: number;
  revenue: number;
}

/**
 * Buckets orders inside the window entirely in the database — 24 or 30 rows come
 * back, never the underlying orders. Offsets are measured from the window start
 * rather than `date_trunc`, because `date_trunc` would truncate in the Postgres
 * session timezone (set by the connection, invisible here) and could disagree
 * with the server-local boundaries the summary cards use. Both UTC and
 * Asia/Kuala_Lumpur are DST-free, so fixed-width buckets are exact.
 */
async function fetchSeriesRows(
  storeId: string,
  analyticsWindow: AnalyticsWindow
): Promise<SeriesRow[]> {
  const bucketSeconds = analyticsWindow.granularity === "hourly" ? 3600 : 86400;

  return prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
    SELECT
      floor(extract(epoch from (o.created_at - ${analyticsWindow.current.start}::timestamptz)) / ${bucketSeconds}::int)::int AS bucket,
      count(*)::int AS count,
      coalesce(sum(o.total), 0)::float8 AS revenue
    FROM orders o
    WHERE o.store_id = ${storeId}
      AND o.status <> 'CANCELLED'
      AND o.created_at >= ${analyticsWindow.current.start}
      AND o.created_at <= ${analyticsWindow.current.end}
    GROUP BY 1
  `);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedStoreId = searchParams.get("storeId");

    let store;
    if (requestedStoreId) {
      // Verify ownership (ADMIN may query any store)
      store = await prisma.store.findUnique({
        where: { id: requestedStoreId },
        select: { id: true, ownerId: true },
      });
      if (!store) {
        return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
      }
      if (store.ownerId !== session.user.id && session.user.role !== "ADMIN") {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Default: first store owned by this merchant
      store = await prisma.store.findFirst({ where: { ownerId: session.user.id } });
      if (!store) {
        return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
      }
    }

    const analyticsWindow = resolveAnalyticsWindow(parseAnalyticsRange(searchParams.get("range")));
    // One predicate, reused by every aggregate, so the cards, the top items and
    // the chart can never drift onto different windows.
    const inWindow = (w: { start: Date; end: Date }) => ({
      storeId: store.id,
      status: { not: "CANCELLED" },
      createdAt: { gte: w.start, lte: w.end },
    });

    const [current, previous, topItems, totalOrdersCount, seriesRows] = await Promise.all([
      prisma.order.aggregate({ where: inWindow(analyticsWindow.current), _sum: { total: true }, _count: true }),
      prisma.order.aggregate({ where: inWindow(analyticsWindow.previous), _sum: { total: true } }),
      prisma.orderItem.groupBy({
        by: ["menuItemId", "itemName"],
        where: { order: inWindow(analyticsWindow.current) },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      prisma.order.count({ where: { storeId: store.id, status: { not: "CANCELLED" } } }),
      fetchSeriesRows(store.id, analyticsWindow),
    ]);

    const revenue = Number(current._sum.total ?? 0);
    const previousRevenue = Number(previous._sum.total ?? 0);
    const ordersCount = current._count;
    // No baseline in the preceding window → no meaningful delta (null hides the badge)
    const revenueChange =
      previousRevenue === 0 ? null : ((revenue - previousRevenue) / previousRevenue) * 100;

    const byBucket = new Map(seriesRows.map((row) => [Number(row.bucket), row]));
    const points =
      analyticsWindow.granularity === "hourly"
        ? Array.from({ length: 24 }, (_, hour) => ({
            hour,
            label: `${hour}:00`,
            count: Number(byBucket.get(hour)?.count ?? 0),
            revenue: Number(byBucket.get(hour)?.revenue ?? 0),
          }))
        : analyticsWindowDays(analyticsWindow).map((day, index) => ({
            date: toIsoDate(day),
            label: toIsoDate(day).slice(5),
            count: Number(byBucket.get(index)?.count ?? 0),
            revenue: Number(byBucket.get(index)?.revenue ?? 0),
          }));

    return NextResponse.json({
      success: true,
      data: {
        range: analyticsWindow.range,
        summary: {
          revenue,
          revenueChange:
            revenueChange === null ? null : parseFloat(revenueChange.toFixed(1)),
          ordersCount,
          totalOrdersCount,
          averageOrderValue: ordersCount > 0 ? revenue / ordersCount : 0,
        },
        topItems: topItems.map((item) => ({
          name: item.itemName,
          quantity: item._sum.quantity ?? 0,
          revenue: Number(item._sum.lineTotal ?? 0),
        })),
        series: { granularity: analyticsWindow.granularity, points },
      },
    });
  } catch (error) {
    logger.error("Analytics Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

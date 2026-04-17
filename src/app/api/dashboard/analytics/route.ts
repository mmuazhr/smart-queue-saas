// =============================================================================
// Merchant Analytics API Route
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, format } from "date-fns";

export async function GET(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Get the merchant's store
    const store = await prisma.store.findFirst({
      where: { ownerId: session.user.id }
    });

    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const yesterdayStart = startOfDay(subDays(now, 1));
    const yesterdayEnd = endOfDay(subDays(now, 1));

    // 2. Revenue Metrics (Today vs Yesterday)
    const [todayOrders, yesterdayOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          storeId: store.id,
          status: { not: "CANCELLED" },
          createdAt: { gte: todayStart, lte: todayEnd }
        },
        select: { total: true, createdAt: true }
      }),
      prisma.order.findMany({
        where: {
          storeId: store.id,
          status: { not: "CANCELLED" },
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd }
        },
        select: { total: true }
      })
    ]);

    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + o.total, 0);
    const revenueChange = yesterdayRevenue === 0 ? 100 : ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;

    // 3. Top 5 Items (All time / current trends)
    const topItems = await prisma.orderItem.groupBy({
      by: ["menuItemId", "itemName"],
      where: {
        order: {
          storeId: store.id,
          status: { not: "CANCELLED" }
        }
      },
      _sum: {
        quantity: true,
        lineTotal: true
      },
      orderBy: {
        _sum: {
          quantity: "desc"
        }
      },
      take: 5
    });

    // 4. Hourly Distribution (Last 24 Hours)
    // We'll create 24 buckets
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i}:00`,
      count: 0,
      revenue: 0
    }));

    todayOrders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlyData[hour].count += 1;
      hourlyData[hour].revenue += order.total;
    });

    // 5. Overall Stats
    const totalOrdersCount = await prisma.order.count({
      where: { storeId: store.id, status: { not: "CANCELLED" } }
    });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          todayRevenue,
          revenueChange: parseFloat(revenueChange.toFixed(1)),
          todayOrdersCount: todayOrders.length,
          totalOrdersCount,
          averageOrderValue: todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0
        },
        topItems: topItems.map(item => ({
          name: item.itemName,
          quantity: item._sum.quantity || 0,
          revenue: item._sum.lineTotal || 0
        })),
        hourlyDistribution: hourlyData
      }
    });

  } catch (error) {
    console.error("Analytics Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error" 
    }, { status: 500 });
  }
}

import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// TODO: create the R2 bucket + NEXT_INC_CACHE_R2_BUCKET binding, then enable the
// incremental cache override below.
// import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache,
});

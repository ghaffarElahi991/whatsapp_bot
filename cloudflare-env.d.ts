declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    META_ACCESS_TOKEN?: string;
    META_PHONE_NUMBER_ID?: string;
    META_TEMPLATE_NAME?: string;
    META_TEMPLATE_LANGUAGE?: string;
    META_GRAPH_API_VERSION?: string;
  }
}

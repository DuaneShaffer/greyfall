// Content JSON is imported statically and validated with the zod schemas at
// startup, so the raw module type is intentionally opaque.
declare module "*.json" {
  const value: unknown;
  export default value;
}

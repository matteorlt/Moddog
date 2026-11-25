// CSS files imported from TypeScript are bundled as plain text (see build.mjs).
declare module "*.css" {
  const content: string;
  export default content;
}

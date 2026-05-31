declare module "helmet" {
  import { RequestHandler } from "express";
  function helmet(config?: any): RequestHandler;
  namespace helmet {}
  export = helmet;
}

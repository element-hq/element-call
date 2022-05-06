declare module "*.module.css" {
  const classes: {
    [key: string]: string;
  };
  export default classes;
}
declare module "*.svg" {
  export const ReactComponent: React.FunctionComponent<
    React.SVGAttributes<SVGElement>
  >;
}

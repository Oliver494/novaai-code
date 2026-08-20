import type { ComponentProps } from "react";
import { ChatPane } from "./ChatPane";

type Props = Omit<ComponentProps<typeof ChatPane>, "mode">;

export function NovaCodeWorkspace(props: Props) {
  return <div className="product-workspace product-workspace--code"><ChatPane {...props} mode="code" /></div>;
}

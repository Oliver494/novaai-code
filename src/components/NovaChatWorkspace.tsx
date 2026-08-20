import type { ComponentProps } from "react";
import { ChatPane } from "./ChatPane";

type Props = Omit<ComponentProps<typeof ChatPane>, "mode">;

export function NovaChatWorkspace(props: Props) {
  return <div className="product-workspace product-workspace--chat"><ChatPane {...props} mode="chat" /></div>;
}

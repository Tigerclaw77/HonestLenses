import type { EyeRx } from "../../components/cart/RxBlock";

export type RxData = {
  expires: string;
  right?: EyeRx;
  left?: EyeRx;
};

export type CartOrder = {
  id: string;
  rx: RxData | null;
  sku: string | null;

  box_count: number | null;
  right_box_count?: number | null;
  left_box_count?: number | null;

  total_amount_cents: number | null;
};

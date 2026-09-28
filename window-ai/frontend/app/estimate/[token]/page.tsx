import type { Metadata } from "next";
import CustomerPortal from "@/components/CustomerPortal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your estimate · Better View Solutions",
  robots: { index: false, follow: false },
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function CustomerEstimatePage({ params }: { params: { token: string } }) {
  return <CustomerPortal token={safeDecode(params.token)} />;
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PracticesManager } from "../../components/practices-manager";

export default function CropPracticesPage() {
  const { crop } = useParams<{ crop: string }>();
  const name = decodeURIComponent(crop);

  return (
    <div className="space-y-4">
      <Link
        href="/crops"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-green-600"
      >
        <ArrowLeft size={16} /> Back to crops
      </Link>
      <PracticesManager crop={name} />
    </div>
  );
}

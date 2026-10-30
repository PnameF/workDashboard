"use client";
import { useState } from "react";
import Image from "next/image";
import { nameInitials } from "@/lib/auth-types";
import { memberColor } from "@/lib/member-color";
export default function MemberAvatar({
  id,
  name,
  url,
}: {
  id: string | number;
  name: string;
  url?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="avatar member-avatar"
      title={name}
      style={{ background: memberColor(Number(id)) }}
    >
      {url && !failed ? (
        <Image
          src={url}
          alt=""
          width={32}
          height={32}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        nameInitials(name)
      )}
    </span>
  );
}

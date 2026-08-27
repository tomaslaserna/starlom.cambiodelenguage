"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/components/ui/utils";

export type MessageResponseProps = ComponentProps<typeof Streamdown>;
const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn("size-full min-w-0 break-words leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:break-words [&_a]:font-bold [&_a]:text-[#075ac7] [&_a]:underline [&_code]:break-words [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_strong]:font-extrabold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (previous, next) => previous.children === next.children && previous.isAnimating === next.isAnimating,
);

MessageResponse.displayName = "MessageResponse";

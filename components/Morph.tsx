import { ViewTransition, type ReactNode } from "react";

/** Marks an element as "the same thing" on two pages (a portrait in a list and on its profile),
 *  so the browser moves it across instead of swapping it. Without support, nothing changes. */
export default function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name.replace(/[^a-zA-Z0-9_-]/g, "_")} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

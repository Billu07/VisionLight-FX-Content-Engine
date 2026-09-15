import type { PageRole } from "./types";

/** Page roles in plain words. The API enforces them: Viewers read, Editors build and
 *  publish tours (and check out), Admins also run the page — settings, people, client
 *  pages — and delete tours. */
export const ROLE_INFO: Record<PageRole, { label: string; as: string; summary: string }> = {
  ADMIN: { label: "Admin", as: "an Admin", summary: "everything — page settings, people, tours and checkout." },
  EDITOR: {
    label: "Editor",
    as: "an Editor",
    summary: "builds and publishes tours, uploads clips and checks out. Can't change page settings or people, or delete tours.",
  },
  VIEWER: { label: "Viewer", as: "a Viewer", summary: "sees every tour, drafts included, but can't change anything." },
};

export const ROLE_ORDER: PageRole[] = ["ADMIN", "EDITOR", "VIEWER"];

export const canEditPage = (role: PageRole | null | undefined) => role === "ADMIN" || role === "EDITOR";
export const isPageAdmin = (role: PageRole | null | undefined) => role === "ADMIN";

export type EngineType = "kie" | "studio" | "openai" | "veo" | "3dx";
export type StudioMode = "image" | "carousel" | "edit";
export type VisualTab = "picdrift" | "studio" | "videofx" | "3dx";

export interface GenerationState {
  status: "idle" | "generating" | "completed" | "error";
  result?: any;
  error?: string;
}

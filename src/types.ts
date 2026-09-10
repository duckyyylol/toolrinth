import { ProjectTypes } from "@toolrinth/lib";

export enum ContextTypes {
  GUILD = "guild",
  USER = "user"
}

export enum RinthEvents {
  USER_AUTHORIZE="userAuthorize"
}

export const projectTypesReadable = {
  [ProjectTypes.DATAPACK]: "Datapack",
  [ProjectTypes.MOD]: "Mod",
  [ProjectTypes.MODPACK]: "Modpack",
  [ProjectTypes.PLUGIN]: "Plugin",
  [ProjectTypes.RESOURCEPACK]: "Resource Pack",
  [ProjectTypes.SHADER]: "Shader",
}

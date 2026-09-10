import { drizzle } from "drizzle-orm/postgres-js";

import postgres from "postgres"
import * as schema from "./schema"

const client = postgres(process.argv.includes("-dev") ? process.env.DATABASE_URL_DEV : process.env.DATABASE_URL);

export const db = drizzle(client, { schema });

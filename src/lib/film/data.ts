import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"
import { computeFilm, type Raw } from "@/lib/film/compute"

const read = async (name: string) => JSON.parse(await readFile(path.join(process.cwd(), "public", "data", `${name}.json`), "utf-8"))

export const getFilmData = cache(async () => {
  const [le, hle, avoidable, evidence, hex, intl] = await Promise.all(["le", "hle", "avoidable", "evidence", "hex", "intl"].map(read))
  return computeFilm({ le, hle, avoidable, evidence, hex, intl } as Raw)
})

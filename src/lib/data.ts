import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"
import { computeFilm, type Raw } from "@/lib/compute"

const read = async (name: string) => JSON.parse(await readFile(path.join(process.cwd(), "data", `${name}.json`), "utf-8"))

export const getFilmData = cache(async () => {
  const [le, hle, avoidable, evidence, hex] = await Promise.all(["le", "hle", "avoidable", "evidence", "hex"].map(read))
  return computeFilm({ le, hle, avoidable, evidence, hex } as Raw)
})

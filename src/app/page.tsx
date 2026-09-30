import { Film } from "@/film/Film"
import { getFilmData } from "@/lib/film/data"

export default async function HomePage() {
  const data = await getFilmData()
  return <Film data={data} />
}

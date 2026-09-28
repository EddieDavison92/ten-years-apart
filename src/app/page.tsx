import { Film } from "@/film/Film"
import { getFilmData } from "@/lib/data"

export default async function Page() {
  const data = await getFilmData()
  return <Film data={data} />
}

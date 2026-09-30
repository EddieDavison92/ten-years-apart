import type { Metadata } from "next"
import { Story } from "@/components/story/Story"
import { getStoryData } from "@/lib/story/data"

export const metadata: Metadata = { title: "The long version" }

export default async function StoryPage() {
  const data = await getStoryData()
  return <Story data={data} />
}

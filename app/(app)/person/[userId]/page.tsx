import { PersonScreen } from "@/components/person/person-screen";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return <PersonScreen userId={userId} />;
}

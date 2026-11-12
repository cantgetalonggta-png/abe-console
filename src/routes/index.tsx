import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console/console";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Console />;
}

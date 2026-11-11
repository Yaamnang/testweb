import { SetupForm } from "./setup-form";

/** Only reachable when SETUP_KEY is set: proxy.ts answers 404 otherwise. */
export default function SetupPage() {
  return <SetupForm />;
}

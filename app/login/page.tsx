import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui";
import { captchaEnabled, newCaptcha } from "@/lib/server/captcha";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginWithSwitches />
    </Suspense>
  );
}

/** Reads CAPTCHA at request time, so the switch works without a rebuild. */
async function LoginWithSwitches() {
  await connection();
  return <LoginForm initialCaptcha={captchaEnabled() ? newCaptcha() : null} />;
}

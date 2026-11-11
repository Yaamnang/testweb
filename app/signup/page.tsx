import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui";
import { captchaEnabled, newCaptcha } from "@/lib/server/captcha";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SignupWithSwitches />
    </Suspense>
  );
}

/** Reads CAPTCHA at request time, so the switch works without a rebuild. */
async function SignupWithSwitches() {
  await connection();
  return <SignupForm initialCaptcha={captchaEnabled() ? newCaptcha() : null} />;
}

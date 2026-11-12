/**
 * Password sign-in, local sign-up and the demo member list exist only for local development
 * and the check scripts. Any production build (a deploy, or `next start`) is Google sign-in only.
 */
export function devAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

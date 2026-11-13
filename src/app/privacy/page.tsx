import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="13 November 2026">
      <p>
        Unite by Faith helps Christians aged 18 and over find friends and small groups who share their faith and
        everyday life. This page explains what we collect, why, and the choices you have.
      </p>
      <h2 className="h2">What We Collect</h2>
      <ul>
        <li>From Google sign-in: your name, email address and profile photo. We never see your Google password.</li>
        <li>
          What you tell us: date of birth, gender, city, the age range and kind of people you would like to meet, when
          you are usually free, languages, church tradition and faith stage, and the habits, interests and personal
          topics you choose or type.
        </li>
        <li>Messages you send in 1v1 and group chats, and the groups you join.</li>
      </ul>
      <h2 className="h2">How We Use It</h2>
      <ul>
        <li>To suggest people and groups who fit you. Matching looks at faith first, then interests and life fit.</li>
        <li>Your date of birth is used only to confirm you are 18 or older and to match you with people near your age.</li>
        <li>Gender is used only to keep 1v1 matches same-gender.</li>
        <li>To run chats and keep the service safe.</li>
      </ul>
      <p>We do not sell your data and we do not show ads.</p>
      <h2 className="h2">Who Can See What</h2>
      <ul>
        <li>Only you can see your date of birth, email address, travel distance and the habits you add in your own words.</li>
        <li>
          Other signed-in members can see your name, photo, chosen habits and personal topics on match cards and in
          groups. People who are not signed in see nothing.
        </li>
        <li>Chat messages are visible only to the people in that chat.</li>
      </ul>
      <h2 className="h2">Where It Is Stored</h2>
      <p>
        Your data is stored with Supabase (database and sign-in, in India) and the site runs on Cloudflare. Google
        handles sign-in. These providers process data for us under their own security and privacy terms.
      </p>
      <h2 className="h2">Under 18s</h2>
      <p>
        Unite by Faith is only for people 18 and older. If someone confirms a date of birth under 18, we delete the
        account straight away.
      </p>
      <h2 className="h2">Your Choices</h2>
      <p>
        You can change your profile, habits and topics at any time. To get a copy of your data or have your account
        and data deleted, email{' '}
        <a href="mailto:swipecraft.in@gmail.com">swipecraft.in@gmail.com</a>. We will act on it within 30 days.
      </p>
      <h2 className="h2">Changes</h2>
      <p>If we change this policy, we will update the date above and tell members in the app about important changes.</p>
    </LegalPage>
  );
}

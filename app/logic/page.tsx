import { redirect } from 'next/navigation';

export default function LogicRedirect() {
  redirect('/admin?section=logic');
}

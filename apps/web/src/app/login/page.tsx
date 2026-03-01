import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="aurora-auth-dark min-h-screen flex items-center justify-center px-4 py-12">
      <div className="relative z-10 w-full flex items-center justify-center">
        <LoginForm />
      </div>
    </div>
  );
}

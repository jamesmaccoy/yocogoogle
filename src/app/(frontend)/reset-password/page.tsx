import ResetPasswordForm from './_components/ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Set New Password</h1>
        <ResetPasswordForm />
      </div>
    </div>
  )
}


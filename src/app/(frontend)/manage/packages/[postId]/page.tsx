import { getMeUser } from '@/utilities/getMeUser'
import { redirect } from 'next/navigation'
import ManagePackagesForPost from './page.client'

interface Props {
  params: Promise<{ postId: string }>
}

export default async function ManagePackagesForPostPage({ params }: Props) {
  const meUser = await getMeUser()

  // Check if user is authenticated and has host role
  if (!meUser?.user) {
    redirect('/login?redirect=/manage/packages')
  }

  if (!(meUser.user as any).role?.includes('host') && !(meUser.user as any).role?.includes('admin')) {
    redirect('/')
  }

  const { postId } = await params
  return <ManagePackagesForPost postId={postId} />
} 
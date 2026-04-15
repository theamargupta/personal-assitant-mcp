import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { updateTransaction, deleteTransaction } from '@/lib/finance/transactions'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  try {
    const body = await request.json()
    const transaction = await updateTransaction(auth.userId, id, {
      categoryId: body.category_id,
      note: body.note,
      merchant: body.merchant,
      amount: body.amount,
    })

    return NextResponse.json(transaction)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message === 'Transaction not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  try {
    await deleteTransaction(auth.userId, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}

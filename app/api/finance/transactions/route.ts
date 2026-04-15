import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createTransaction, listTransactions } from '@/lib/finance/transactions'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const transaction = await createTransaction({
      userId: auth.userId,
      amount: body.amount,
      merchant: body.merchant,
      sourceApp: body.source_app,
      categoryId: body.category_id,
      note: body.note,
      transactionDate: body.transaction_date,
      rawSms: body.raw_sms,
      isAutoDetected: body.is_auto_detected,
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const params = request.nextUrl.searchParams

  try {
    const result = await listTransactions({
      userId: auth.userId,
      categoryId: params.get('category_id') || undefined,
      startDate: params.get('start_date') || undefined,
      endDate: params.get('end_date') || undefined,
      uncategorizedOnly: params.get('uncategorized') === 'true',
      limit: params.get('limit') ? parseInt(params.get('limit')!) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : undefined,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}

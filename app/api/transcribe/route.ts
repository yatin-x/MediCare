import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    const role  = formData.get('role')  as string ?? 'user'

    if (!audio || audio.size < 1000) {
      return NextResponse.json({ text: '' })
    }

    const buffer  = Buffer.from(await audio.arrayBuffer())
    const tmpPath = join(tmpdir(), `${randomUUID()}.webm`)
    await writeFile(tmpPath, buffer)

    // Call Whisper via OpenAI API
    const whisperForm = new FormData()
    whisperForm.append('file', new Blob([buffer], { type: 'audio/webm' }), 'audio.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'en')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    })

    await unlink(tmpPath).catch(() => {})

    if (!response.ok) {
      const err = await response.text()
      console.error('Whisper error:', err)
      return NextResponse.json({ text: '' })
    }

    const result = await response.json()
    const text   = result.text?.trim() ?? ''

    return NextResponse.json({ text: text ? `[${role}] ${text}\n` : '' })
  } catch (err) {
    console.error('Transcribe route error:', err)
    return NextResponse.json({ text: '' })
  }
}
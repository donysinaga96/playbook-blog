// Cek HTTP dengan header Host tertentu (fetch tidak bisa mengganti Host).
//   node http-check.mjs <url> <host> <status> [teks-yang-harus-ada]
// Dipakai pemeriksaan image di CI (deploy/ci-image-check.sh).
import http from 'node:http'

const [url, host, status, text] = process.argv.slice(2)
if (!url || !host || !status) {
  console.error('pemakaian: node http-check.mjs <url> <host> <status> [teks]')
  process.exit(2)
}
const target = new URL(url)
const req = http.request(target, { headers: { host }, timeout: 15000 }, (res) => {
  let body = ''
  res.setEncoding('utf8')
  res.on('data', (chunk) => {
    body += chunk
  })
  res.on('end', () => {
    const okStatus = String(res.statusCode) === status
    const okText = !text || body.includes(text)
    const note = text ? ` (teks "${text}" ${okText ? 'ada' : 'TIDAK ada'})` : ''
    console.log(`${okStatus && okText ? 'PASS' : 'FAIL'}  ${host} ${target.pathname}${target.search} -> ${res.statusCode}${note}`)
    process.exit(okStatus && okText ? 0 : 1)
  })
})
req.on('timeout', () => req.destroy(new Error('timeout')))
req.on('error', (error) => {
  console.log(`FAIL  ${host} ${url}: ${error.message}`)
  process.exit(1)
})
req.end()

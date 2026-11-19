// Test yang membaca database dilewati bila DATABASE_URL tidak ada (nyaman
// untuk development). Di CI itu berarti test isolasi site bisa "hijau"
// tanpa pernah berjalan, jadi di CI DATABASE_URL wajib ada.
import { expect, it } from 'vitest'

it.skipIf(!process.env['CI'])('di CI, DATABASE_URL wajib ada agar test database tidak dilewati diam-diam', () => {
  expect(process.env['DATABASE_URL'], 'job CI harus menyalakan PostgreSQL dan mengisi DATABASE_URL').toBeTruthy()
})

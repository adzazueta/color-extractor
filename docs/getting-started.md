# Getting Started

## Install

```sh
npm install @adzazueta/color-extractor
```

Node.js decoding needs the optional `sharp` peer dependency:

```sh
npm install sharp
```

The Node entrypoint requires Node.js `^20.19.0 || >=22.12.0`.

## Extract colors

```ts
import { extractColors } from '@adzazueta/color-extractor'

const result = await extractColors(image)

console.log(result.primary.hex)
console.log(result.secondary?.hex)
```

The minimal result always has a `primary` color and a `secondary` color or `null`.

## Browser file input

```ts
const input = document.querySelector<HTMLInputElement>('#image')
const file = input?.files?.[0]

if (file) {
  const { primary } = await extractColors(file)
  document.body.style.background = primary.hex
}
```

## Node local file

```ts
import { extractColors } from '@adzazueta/color-extractor/node'

const result = await extractColors('./photo.jpg')
console.log(result.primary)
```

## Next steps

- Enable [palette, accents, or metadata](configuration.md#output).
- Read about [supported input types](runtime-support.md).
- Handle [typed errors](api-reference.md#errors) when processing user-provided images.

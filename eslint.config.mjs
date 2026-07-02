import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

const importSortGroups = [
  ['^react', '^next'],
  ['^@?\w'],
  ['^@/types'],
  ['^@/config'],
  ['^@/lib'],
  ['^@/hooks'],
  ['^@/components/ui'],
  ['^@/components'],
  ['^@/registry'],
  ['^@/styles'],
  ['^@/app'],
  ['^\u0000'],
  ['^\.\.(?!/?$)', '^\.\./?$'],
  ['^\./(?=.*/)(?!/?$)', '^\.(?!/?$)', '^\./?$'],
  ['^.+\.s?css$']
]

const globalIgnorePatterns = [
  '.next/**',
  'out/**',
  'build/**',
  'next-env.d.ts',
  'app/api/advanced-search/**',
  '**/app/api/advanced-search/**',
  // Project tooling config; Prettier reads this directly, ESLint does not need to lint it.
  'prettier.config.js'
]

export default defineConfig([
  globalIgnores(globalIgnorePatterns),
  ...nextVitals,
  {
    ignores: globalIgnorePatterns
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: importSortGroups
        }
      ],
      'simple-import-sort/exports': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tabler/icons-react',
              message:
                'Please use NativeIcon from @/components/native/native-icon instead.'
            }
          ]
        }
      ]
    }
  }
])

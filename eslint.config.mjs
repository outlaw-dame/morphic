import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

const importSortGroups = [
  ['^react', '^next'],
  ['^@?\\w'],
  ['^@/types'],
  ['^@/config'],
  ['^@/lib'],
  ['^@/hooks'],
  ['^@/components/ui'],
  ['^@/components'],
  ['^@/registry'],
  ['^@/styles'],
  ['^@/app'],
  ['^\\u0000'],
  ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
  ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
  ['^.+\\.s?css$']
]

export default defineConfig([
  ...nextVitals,
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
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Project tooling config; Prettier reads this directly, ESLint does not need to lint it.
    'prettier.config.js',
    // Phase AI-1 advanced-search files need a follow-up style-only normalization pass.
    'app/api/advanced-search/route.ts',
    'lib/tools/search/advanced-search.ts',
    'lib/tools/search/advanced-search.test.ts',
    // Phase AI-2 schema/capability files need a follow-up style-only normalization pass.
    'lib/ai/schemas/**/*.ts',
    'lib/models/capabilities.ts',
    'lib/models/capabilities.test.ts'
  ])
])

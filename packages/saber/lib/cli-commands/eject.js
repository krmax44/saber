const path = require('path')
const { spawnSync } = require('child_process')
const { fs } = require('saber-utils')
const { log } = require('saber-log')
const downloadRepo = require('download-git-repo')
const configLoader = require('../utils/configLoader')
const resolvePackage = require('../utils/resolvePackage')
const { handleError, spawn } = require('./utils')

module.exports = function(cli) {
  cli
    .command(
      'eject [app]',
      `Copy the currently used theme's source code to a local folder.`
    )
    .option(
      '--git',
      'Pull code from Git, instead of node_modules, and add the theme as a submodule',
      { default: false }
    )
    .option(
      '--merge-dependencies',
      "Copy over the theme's dependencies to your project's package.json.",
      { default: true }
    )
    .option('--path <path>', 'Ejected theme destination', {
      default: './theme'
    })
    .action(async (cwd = '.', options) => {
      cwd = path.join(process.cwd(), cwd)
      const { git } = options
      const mergeDependencies = options['merge-dependencies']

      const config =
        configLoader.load({ cwd, files: configLoader.CONFIG_FILES }).data || {}
      if (!config.theme) {
        handleError('No theme specified in config.')
      }

      const destPath = path.join(cwd, options.path)
      const relativeDest = path.relative(cwd, destPath)
      if (await fs.pathExists(destPath)) {
        handleError(
          `The path ${
            options.path
          } already exists. Please specify a different one using "--path".`
        )
      }

      const themePath = resolvePackage(config.theme, {
        prefix: 'saber-theme-',
        cwd
      })
      if (!themePath) {
        handleError(
          `Theme "${config.theme}" could not be found in your node_modules.`
        )
      }

      const themePackage = configLoader.load({
        cwd: themePath,
        files: ['package.json']
      }).data

      if (git) {
        const repo = themePackage.repository
        if (repo && repo.url) {
          const tmp = path.join(cwd, '.saber', 'theme-tmp')

          const dl = await new Promise(resolve =>
            downloadRepo(repo.url, tmp, {}, resolve)
          )

          if (dl) {
            handleError(dl)
          }

          try {
            await fs.move(
              repo.directory ? path.join(tmp, repo.directory) : tmp,
              destPath
            )

            await fs.remove(tmp)
          } catch (error) {
            handleError(error)
          }

          log.success('Downloaded theme source via Git.')
        } else {
          handleError(
            'The theme has no git repository specified within its package.json.'
          )
        }
      } else {
        try {
          await fs.copy(themePath, destPath, {
            filter: src => !src.endsWith('/node_modules')
          })

          log.info('Copied theme from node_modules.')
        } catch (error) {
          handleError(error)
        }
      }

      if (mergeDependencies) {
        const dependencies = themePackage.dependencies || {}
        const devDependencies = themePackage.devDependencies || {}

        const projectPackage = configLoader.load({
          cwd,
          files: ['package.json']
        }).data

        try {
          await fs.writeJson(
            path.join(cwd, 'package.json'),
            {
              ...projectPackage,
              dependencies: {
                ...projectPackage.dependencies,
                ...dependencies,
                [themePackage.name]: undefined // remove theme from dependencies
              },
              devDependencies: {
                ...projectPackage.devDependencies,
                ...devDependencies,
                [themePackage.name]: undefined // remove theme from dev dependencies
              }
            },
            { spaces: 2 }
          )

          try {
            spawnSync('yarn', ['--version']) // test if yarn is present before allowing it to use the same stdio
            await spawn('yarn', [], { stdio: 'inherit' })
          } catch (error) {
            await spawn('npm i', [], { stdio: 'inherit' })
          }

          log.success('Merged theme dependencies.')
        } catch (error) {
          handleError(error)
        }
      }

      log.info(
        `Please change "theme" in your Saber config to "./${relativeDest}".`
      )
    })
}
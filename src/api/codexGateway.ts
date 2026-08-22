// Domain-modularized slices (see gateway/). Re-exported here so existing
// consumers importing from './codexGateway' keep working unchanged.
export * from './gateway/automations'
export * from './gateway/search'
export * from './gateway/terminal'
export * from './gateway/threads'
export * from './gateway/models'
export * from './gateway/directory'
export * from './gateway/accounts'
export * from './gateway/git'
export * from './gateway/files'
export * from './gateway/develop'
export * from './gateway/misc'
# devshell/src/

Reserved for any TypeScript glue DevShell ends up needing — host-side experiment scripts, bridge codegen, native-spec validation, telemetry replay tools.

Currently empty by design. The DevShell binaries themselves are pure native (Kotlin / Swift / C++); no TS runtime ships inside them. If experiments grow a host-side tool, it lands here so it doesn't pollute the proto's `src/`.

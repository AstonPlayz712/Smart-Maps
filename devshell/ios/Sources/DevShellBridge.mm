// DevShellBridge.mm
//
// Obj-C++ implementation — bridges Swift to the shared C++ renderer
// living under devshell/native/core/.

#import "DevShellBridge.h"
#import <os/log.h>

#include "renderer.h"   // devshell/native/core/renderer.h via Header Search Paths

@implementation DevShellBridge {
    devshell::Renderer _renderer;
}

- (NSString *)greeting {
    const std::string msg = _renderer.greeting();
    return [NSString stringWithUTF8String:msg.c_str()];
}

- (int32_t)version {
    return _renderer.version();
}

- (void)log:(NSString *)message {
    if (message == nil) return;
    os_log(OS_LOG_DEFAULT, "DevShell native: %{public}@", message);
}

@end

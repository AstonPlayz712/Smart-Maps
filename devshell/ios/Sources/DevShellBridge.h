// DevShellBridge.h
//
// Obj-C surface exposed to Swift. Implementation in DevShellBridge.mm
// is Obj-C++ so it can import the shared C++ header from
// devshell/native/core/.
//
// Add this header to your project's Bridging-Header.h:
//   #import "DevShellBridge.h"

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface DevShellBridge : NSObject

- (NSString *)greeting;
- (int32_t)version;
- (void)log:(NSString *)message;

@end

NS_ASSUME_NONNULL_END

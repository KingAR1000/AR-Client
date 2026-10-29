package xyz.kingar1000.ar.mixin;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import xyz.kingar1000.ar.ArClient;
@Mixin(MouseHandler.class)
public class MouseMixin {
 @Inject(method="onButton(JLnet/minecraft/client/input/MouseButtonInfo;I)V",at=@At("HEAD"))
 private void ar$countClick(long window, MouseButtonInfo input, int action, CallbackInfo ci) {
  if(action == 1) ArClient.click(input.button());
 }
}

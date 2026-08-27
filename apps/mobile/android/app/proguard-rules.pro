# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ------------------------------------------------------------------
# Regras do Capacitor.
#
# So valem se minifyEnabled voltar a ser true no build.gradle. Hoje
# esta desligado: o R8 sem estas regras removia as classes de plugin
# e o app fechava ao tocar em registrar (o plugin de GPS sumia).
# Se ligar o minify de novo, teste o APK de release NUM APARELHO antes
# de distribuir — o bug nao aparece no build debug nem no navegador.
# ------------------------------------------------------------------

# Ponte JS <-> nativo
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins do Capacitor sao localizados por reflexao a partir da anotacao
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Plugins oficiais usados por este app
-keep class com.capacitorjs.plugins.** { *; }

# Anotacoes precisam sobreviver para a reflexao funcionar
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions

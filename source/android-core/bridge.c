#include <jni.h>
#include <stdlib.h>
extern char* PawStart(char*, char*);
extern void PawStop(void);
extern void PawResetNetwork(void);
extern void PawSetSystemDNS(char*);
extern char* PawStats(void);
extern int PawProbe(char*);
extern char* PawDiagnostics(void);
extern char* PawDumpStacks(char*);
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_start(JNIEnv* env, jobject self, jstring home, jstring config) {
 const char* h=(*env)->GetStringUTFChars(env,home,0);
 const char* c=(*env)->GetStringUTFChars(env,config,0);
 char* error=PawStart((char*)h,(char*)c);
 (*env)->ReleaseStringUTFChars(env,home,h);
 (*env)->ReleaseStringUTFChars(env,config,c);
 jstring result=(*env)->NewStringUTF(env,error);
 free(error);
 return result;
}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_stop(JNIEnv* env, jobject self) {PawStop();}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_resetNetwork(JNIEnv* env, jobject self) {PawResetNetwork();}
JNIEXPORT void JNICALL Java_com_pawlink_android_NativeCore_setSystemDns(JNIEnv* env, jobject self, jstring list) {
 const char* l=(*env)->GetStringUTFChars(env,list,0);
 PawSetSystemDNS((char*)l);
 (*env)->ReleaseStringUTFChars(env,list,l);
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_stats(JNIEnv* env, jobject self) {
 char* value=PawStats();
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}
JNIEXPORT jint JNICALL Java_com_pawlink_android_NativeCore_probe(JNIEnv* env, jobject self, jstring json) {
 const char* text=(*env)->GetStringUTFChars(env,json,0);
 int result=PawProbe((char*)text);
 (*env)->ReleaseStringUTFChars(env,json,text);
 return result;
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_diagnostics(JNIEnv* env, jobject self) {
 char* value=PawDiagnostics();
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}
JNIEXPORT jstring JNICALL Java_com_pawlink_android_NativeCore_dumpStacks(JNIEnv* env, jobject self, jstring path) {
 const char* p=(*env)->GetStringUTFChars(env,path,0);
 char* value=PawDumpStacks((char*)p);
 (*env)->ReleaseStringUTFChars(env,path,p);
 jstring result=(*env)->NewStringUTF(env,value);
 free(value);
 return result;
}

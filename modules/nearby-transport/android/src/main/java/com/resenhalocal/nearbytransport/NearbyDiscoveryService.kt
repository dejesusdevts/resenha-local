package com.resenhalocal.nearbytransport

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Serviço em primeiro plano simples, cuja única função é manter uma
 * notificação visível enquanto o app está anunciando/descobrindo
 * dispositivos próximos — exigência do Android para esse tipo de operação
 * contínua em segundo plano. Não contém nenhuma lógica de rede própria;
 * toda a comunicação real acontece no NearbyTransportModule.
 */
class NearbyDiscoveryService : Service() {

  companion object {
    private const val CHANNEL_ID = "resenha_local_discovery"
    private const val NOTIFICATION_ID = 1001
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    return START_STICKY
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Busca de pessoas próximas",
        NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Resenha Local")
      .setContentText("Buscando pessoas por perto")
      .setSmallIcon(android.R.drawable.ic_menu_search)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }
}

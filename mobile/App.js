import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoadingScreen from './src/screens/LoadingScreen';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import AppointmentDetailScreen from './src/screens/AppointmentDetailScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChooseCityScreen from './src/screens/ChooseCityScreen';
import HospitalSelectionScreen from './src/screens/HospitalSelectionScreen';
import DoctorSelectionScreen from './src/screens/DoctorSelectionScreen';
import BookingScreen from './src/screens/BookingScreen';
import BrandHeader from './src/components/BrandHeader';
import { colors } from './src/theme';
import { patientApi } from './src/services/patientApi';
import { connectSocket } from './src/services/socketService';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function PatientTabs() {
  const [unreadNotificationCount, setUnreadNotificationCount] = React.useState(0);
  const refreshUnreadNotificationCount = React.useCallback(async () => {
    try {
      const response = await patientApi.getUnreadNotifications(100);
      setUnreadNotificationCount(response.data.data?.notifications?.length || 0);
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Unread notification count error:', error?.message || error);
      }
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    let socket;
    refreshUnreadNotificationCount();

    connectSocket()
      .then((connectedSocket) => {
        if (!active || !connectedSocket) return;
        socket = connectedSocket;
        socket.on('newNotification', refreshUnreadNotificationCount);
      })
      .catch((error) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Unable to connect to notification updates:', error?.message || error);
        }
      });

    return () => {
      active = false;
      socket?.off('newNotification', refreshUnreadNotificationCount);
    };
  }, [refreshUnreadNotificationCount]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerTitle: () => <BrandHeader />,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleAlign: 'left',
        tabBarActiveTintColor: colors.brandDark,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 4,
          paddingBottom: 7,
        },
        tabBarLabelStyle: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AppointmentsTab"
        component={AppointmentsScreen}
        options={{
          title: 'My Appointments',
          tabBarLabel: 'My Appointments',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BookTab"
        component={ChooseCityScreen}
        options={{
          title: 'Book Appointment',
          tabBarLabel: 'Book Appointment',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="NotificationsTab"
        options={{
          title: 'Notifications',
          tabBarLabel: 'Notifications',
          tabBarBadge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.surface },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} />
          ),
        }}
      >
        {(props) => (
          <NotificationsScreen
            {...props}
            onUnreadCountChange={setUnreadNotificationCount}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, isLoading, sessionError, loadSession } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (sessionError) {
    return <LoadingScreen error={sessionError} onRetry={loadSession} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: true,
          headerTitle: () => <BrandHeader />,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleAlign: 'left',
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="PatientTabs" component={PatientTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Hospitals" component={HospitalSelectionScreen} />
            <Stack.Screen name="Doctors" component={DoctorSelectionScreen} />
            <Stack.Screen name="Booking" component={BookingScreen} />
            <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

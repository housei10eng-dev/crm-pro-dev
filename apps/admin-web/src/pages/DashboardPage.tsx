export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-700">Total Companies</h3>
          <p className="mt-2 text-3xl font-bold text-blue-600">--</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-700">Active Users</h3>
          <p className="mt-2 text-3xl font-bold text-green-600">--</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-700">Revenue (MRR)</h3>
          <p className="mt-2 text-3xl font-bold text-purple-600">--</p>
        </div>
      </div>

      <div className="mt-8 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-bold">Bem-vindo ao Admin Console</h2>
        <p className="text-gray-600">
          Use o menu lateral para navegar entre as diferentes seções do sistema.
        </p>
      </div>
    </div>
  );
}
